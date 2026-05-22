# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-093528-0c84e2f`
**Session file**: [`./20260522-093528-0c84e2f.md`](../20260522-093528-0c84e2f.md)
**Commit**: `0c84e2f` — feat(web2): áp dụng TPOS theme chuẩn cho 11 trang Web 2.0
**Last updated**: 2026-05-22 09:35:28 +07
**Summary**: feat(web2): áp dụng TPOS theme chuẩn cho 11 trang Web 2.0

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/product-category/index.html`
- `web2/products/index.html`
- `web2/purchase-refund/index.html`
- `web2/reconcile/index.html`
- `web2/shared/web2-tpos-theme.css`
- `web2/supplier-debt/index.html`
- `web2/supplier-wallet/index.html`
- `web2/users/index.html`
- `web2/variants/index.html`

## Last 5 commits touching `web2/`

- `0c84e2f9b` feat(web2): áp dụng TPOS theme chuẩn cho 11 trang Web 2.0 _(2026-05-22)_
- `1acd14b39` fix(sidebar): "- WEB 2.0" allow-list chỉ 13 page user xác nhận _(2026-05-22)_
- `75089149e` perf+style(balance-history): TPOS-clone theme + modal anti-lag _(2026-05-22)_
- `7dddd0283` feat(sidebar): "- WEB 2.0" suffix + group badge cho page có code thật _(2026-05-22)_
- `12856d39c` feat(web2-balance-history): UI overlay theo phong cách Web 2.0 _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-093528-0c84e2f` cho Claude walk chain theo CLAUDE.md protocol.
