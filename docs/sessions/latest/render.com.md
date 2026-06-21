# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-154110-0c5bc7d`
**Session file**: [`./20260621-154110-0c5bc7d.md`](../20260621-154110-0c5bc7d.md)
**Commit**: `0c5bc7d` — feat(web2): over-refund cap ví NCC server-authoritative qua so-order (quick-refund + /tx)
**Last updated**: 2026-06-21 15:41:10 +07
**Summary**: over-refund cap ví NCC server-authoritative qua so-order

## Files changed in this commit (`render.com/`)

- `render.com/lib/web2-so-order-qty.js`
- `render.com/routes/purchase-refund.js`
- `render.com/routes/web2-supplier-wallet.js`

## Last 5 commits touching `render.com/`

- `0c5bc7dc3` feat(web2): over-refund cap ví NCC server-authoritative qua so-order (quick-refund + /tx) _(2026-06-21)_
- `7698943db` fix(web2) audit-r9 staged: gate delivery-invoices + refunds mutations (requireWeb2AuthSoft) _(2026-06-21)_
- `2d86f265c` fix(web2) audit-r9: 16 bug (worker SSRF/log-leak, ZNS idempotency, SSE-notify, idempotency) _(2026-06-21)_
- `1a411c409` fix(web2) audit-r8: 16 bug (Zalo double-enc CRIT, double-debit CRIT, secret/PII leaks, timeouts) _(2026-06-21)_
- `db41242b1` fix(web2) audit-r7: 11 bug across cron/native-orders/so-order/auth/sepay/migrations _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-154110-0c5bc7d` cho Claude walk chain theo CLAUDE.md protocol.
