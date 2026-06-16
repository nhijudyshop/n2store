# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-163740-0c0870b`
**Session file**: [`./20260616-163740-0c0870b.md`](../20260616-163740-0c0870b.md)
**Commit**: `0c0870b` — feat(so-order/kho): Part B — Kho SP lưu origin_currency/origin_rate, hover hiện giá gốc ngoại tệ (CNY); write paths gửi origin lúc nhập
**Last updated**: 2026-06-16 16:37:40 +07
**Summary**: feat(so-order/kho): Part B — Kho SP lưu origin_currency/origin_rate, hover hiện giá gốc ngoại tệ (CNY); w...

## Files changed in this commit (`web2/`)

- `web2/overview/index.html`
- `web2/products/index.html`
- `web2/products/js/web2-product-detail.js`
- `web2/products/js/web2-products-app.js`

## Last 5 commits touching `web2/`

- `0c0870b0a` feat(so-order/kho): Part B — Kho SP lưu origin*currency/origin_rate, hover hiện giá gốc ngoại tệ (CNY); write paths gửi origin lúc nhập *(2026-06-16)\_
- `f9e397868` auto: session update _(2026-06-16)_
- `158adf4e7` docs(web2): sync overview + pages-analysis cho money-model nhận-hàng (rule 9) _(2026-06-16)_
- `c7b772e14` auto: session update _(2026-06-16)_
- `2111be18d` fix(supplier-wallet): số liệu NCC về 0₫ sau load — post-Sync render đè 0 (ledger ko có totalPurchased, phải re-aggregate Sổ Order) + debug logs SW-DEBUG _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-163740-0c0870b` cho Claude walk chain theo CLAUDE.md protocol.
