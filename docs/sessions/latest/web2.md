# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-064534-a6fa763`
**Session file**: [`./20260621-064534-a6fa763.md`](../20260621-064534-a6fa763.md)
**Commit**: `a6fa763` — docs(dev-log): audit Web 2.0 25 bug fix (r1a-r1f)
**Last updated**: 2026-06-21 06:45:34 +07
**Summary**: audit Web 2.0 full-surface: fix 25/27 bug (auth/sse-leak/anti-lag/click-path/zalo/pancake)

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-bh-data.js`
- `web2/balance-history/js/web2-pending-match.js`
- `web2/ck-dashboard/index.html`
- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/web2-customer-wallet-events.js`
- `web2/customer-wallet/js/web2-customer-wallet-render.js`
- `web2/customers/index.html`
- `web2/products/index.html`
- `web2/products/js/web2-products-modal.js`
- `web2/purchase-refund/css/purchase-refund.css`
- `web2/purchase-refund/index.html`
- `web2/purchase-refund/js/purchase-refund-modal.js`
- `web2/returns/index.html`
- `web2/shared/web2-msg-template-send.js`
- `web2/shared/web2-qr-modal.js`
- `web2/shared/web2-wallet-balance.js`

## Last 5 commits touching `web2/`

- `77bdd329c` fix(web2) audit-r1f: frontend minor (r.ok check, tz GMT+7, so-order race) _(2026-06-21)_
- `550719520` fix(web2) audit-r1e: click-path double-submit/dup-listener _(2026-06-21)_
- `8956e5f22` fix(web2) audit-r1d: purchase-refund modal anti-lag (bo backdrop blur + shadow 32px->8px24px) _(2026-06-20)_
- `7967c22fb` fix(web2) audit-r1c: cleanup SSE/timer leak khi roi trang (pagehide) _(2026-06-20)_
- `341141081` fix(web2) audit-r1a: QR-write auth + live-comments seq/N+1 + relay 401 log + so-order conflict timer _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-064534-a6fa763` cho Claude walk chain theo CLAUDE.md protocol.
