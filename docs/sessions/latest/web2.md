# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-161338-b9f567b`
**Session file**: [`./20260621-161338-b9f567b.md`](../20260621-161338-b9f567b.md)
**Commit**: `b9f567b` — fix(web2) audit-d: 9 money-path bugs (over-refund regression, PBH oversell/drift, wallet double-credit, sepay race)
**Last updated**: 2026-06-21 16:13:38 +07
**Summary**: audit-d money-path: 9 confirmed bugs fixed (over-refund regression + PBH/wallet/sepay)

## Files changed in this commit (`web2/`)

- `web2/customer-wallet/index.html`
- `web2/shared/web2-wallet-api.js`

## Last 5 commits touching `web2/`

- `b9f567be7` fix(web2) audit-d: 9 money-path bugs (over-refund regression, PBH oversell/drift, wallet double-credit, sepay race) _(2026-06-21)_
- `2d86f265c` fix(web2) audit-r9: 16 bug (worker SSRF/log-leak, ZNS idempotency, SSE-notify, idempotency) _(2026-06-21)_
- `2dcf4b5a8` fix(web2) hotfix r8: ck-dashboard 401 — fetchJson gửi x-web2-token + lucide icon _(2026-06-21)_
- `1a411c409` fix(web2) audit-r8: 16 bug (Zalo double-enc CRIT, double-debit CRIT, secret/PII leaks, timeouts) _(2026-06-21)_
- `db41242b1` fix(web2) audit-r7: 11 bug across cron/native-orders/so-order/auth/sepay/migrations _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-161338-b9f567b` cho Claude walk chain theo CLAUDE.md protocol.
