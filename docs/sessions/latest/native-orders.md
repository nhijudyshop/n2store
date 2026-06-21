# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-144755-7698943`
**Session file**: [`./20260621-144755-7698943.md`](../20260621-144755-7698943.md)
**Commit**: `7698943` — fix(web2) audit-r9 staged: gate delivery-invoices + refunds mutations (requireWeb2AuthSoft)
**Last updated**: 2026-06-21 14:47:55 +07
**Summary**: audit r9: 16 fix + delivery/refund gate staged (worker SSRF/log, ZNS idempotency, SSE-notify)

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-state.js`

## Last 5 commits touching `native-orders/`

- `2d86f265c` fix(web2) audit-r9: 16 bug (worker SSRF/log-leak, ZNS idempotency, SSE-notify, idempotency) _(2026-06-21)_
- `1a411c409` fix(web2) audit-r8: 16 bug (Zalo double-enc CRIT, double-debit CRIT, secret/PII leaks, timeouts) _(2026-06-21)_
- `db41242b1` fix(web2) audit-r7: 11 bug across cron/native-orders/so-order/auth/sepay/migrations _(2026-06-21)_
- `4e3b49217` fix(web2) audit-r6 K-stage1: fast-sale-orders client gửi x-web2-token (11 call site) _(2026-06-21)_
- `c0cf94762` fix(web2) audit-r6: CRITICAL ví trừ không atomic (returns) + 8 fix (auth/worker/DoS/SSE/popup/history) _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-144755-7698943` cho Claude walk chain theo CLAUDE.md protocol.
