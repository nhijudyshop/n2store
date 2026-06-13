# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-141954-13c1960`
**Session file**: [`./20260613-141954-13c1960.md`](../20260613-141954-13c1960.md)
**Commit**: `13c1960` — fix(products): tem QR tên SP bẻ giữa từ — wrap theo space + fitName xét chiều ngang
**Last updated**: 2026-06-13 14:19:54 +07
**Summary**: fix(products): tem QR tên SP bẻ giữa từ — wrap theo space + fitName xét chiều ngang

## Files changed in this commit (`web2/`)

- `web2/products/css/web2-product-detail.css`
- `web2/products/index.html`
- `web2/products/js/web2-product-detail.js`
- `web2/products/js/web2-products-print.js`
- `web2/supplier-debt/index.html`
- `web2/supplier-debt/js/supplier-debt-app.js`
- `web2/supplier-wallet/index.html`
- `web2/supplier-wallet/js/supplier-wallet-app.js`

## Last 5 commits touching `web2/`

- `ccf8b4a3b` fix(web2): Batch 1 audit — công nợ draft/cancelled (A3) + manualSepayId wrap (C17) + partial-return filter (A2) _(2026-06-13)_
- `9e181f9b2` auto: session update _(2026-06-13)_
- `b340b2bc3` auto: session update _(2026-06-13)_
- `f4232cf5c` auto: session update _(2026-06-13)_
- `93d29cedb` docs(web2): 3W6 ✅ trong đợt I (sửa dòng còn lệch) — sidebar _isAdmin ưu tiên Web2Auth role _(2026-06-13)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-141954-13c1960` cho Claude walk chain theo CLAUDE.md protocol.
