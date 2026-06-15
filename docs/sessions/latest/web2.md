# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-202030-f6276d5`
**Session file**: [`./20260615-202030-f6276d5.md`](../20260615-202030-f6276d5.md)
**Commit**: `f6276d5` — fix(web2): gắn x-web2-token cho TOÀN BỘ web2 write còn thiếu (audit) + bump ?v=20260615auth
**Last updated**: 2026-06-15 20:20:30 +07
**Summary**: fix(web2): gắn x-web2-token cho TOÀN BỘ web2 write còn thiếu (audit) + bump ?v=20260615auth

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/ck-dashboard/index.html`
- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/web2-wallet-api.js`
- `web2/customers/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/jt-tracking/index.html`
- `web2/multi-tool/index.html`
- `web2/pancake-settings/index.html`
- `web2/printer-settings/index.html`
- `web2/products/index.html`
- `web2/products/js/web2-products-api.js`
- `web2/products/js/web2-products-print.js`
- `web2/purchase-refund/index.html`
- `web2/returns/index.html`
- `web2/returns/js/returns-api.js`
- `web2/shared/web2-chat-client.js`
- `web2/shared/web2-customer-detail-modal.js`
- `web2/shared/web2-customer-lookup.js`
- `web2/shared/web2-msg-template.js`
- `web2/shared/web2-printer.js`
- `web2/shared/web2-qr-modal.js`
- `web2/shared/web2-wallet-balance.js`
- `web2/supplier-wallet/index.html`
- `web2/variants/index.html`
- `web2/variants/js/web2-variants-api.js`

## Last 5 commits touching `web2/`

- `f6276d58b` fix(web2): gắn x-web2-token cho TOÀN BỘ web2 write còn thiếu (audit) + bump ?v=20260615auth _(2026-06-15)_
- `fa050c1fa` auto: session update _(2026-06-15)_
- `c8b6c4db4` auto: session update _(2026-06-15)_
- `94c569891` feat(web2-jt): tag XỬ LÝ BC đổi icon ngay + lưu DB đồng bộ đa máy _(2026-06-15)_
- `283422bf5` feat(web2): trạng thái/thông tin KH = 1 nguồn chung web2*customers + SSE đồng bộ *(2026-06-15)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-202030-f6276d5` cho Claude walk chain theo CLAUDE.md protocol.
