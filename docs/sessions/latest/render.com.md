# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-132243-db41242`
**Session file**: [`./20260621-132243-db41242.md`](../20260621-132243-db41242.md)
**Commit**: `db41242` — fix(web2) audit-r7: 11 bug across cron/native-orders/so-order/auth/sepay/migrations
**Last updated**: 2026-06-21 13:22:43 +07
**Summary**: audit r7: 11 bug fix (webhook-retry txn, ck-watcher, so-order, token-leak, double-msg, constraint-lock)

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-payment-signals.js`
- `render.com/server.js`
- `render.com/services/web2-ck-watcher.js`
- `render.com/services/web2-sepay-matching.js`
- `render.com/services/web2-unread-reconcile.js`
- `render.com/services/web2-webhook-retry.js`

## Last 5 commits touching `render.com/`

- `db41242b1` fix(web2) audit-r7: 11 bug across cron/native-orders/so-order/auth/sepay/migrations _(2026-06-21)_
- `b32b578b8` fix(web2) audit-r6 K-stage2: gate 13 fast-sale-orders mutation route requireWeb2AuthSoft _(2026-06-21)_
- `b9f7b0f56` fix(web2) audit-r6 L: from-native-order chống over-sell race (lock theo MÃ SP trong txn) _(2026-06-21)_
- `c0cf94762` fix(web2) audit-r6: CRITICAL ví trừ không atomic (returns) + 8 fix (auth/worker/DoS/SSE/popup/history) _(2026-06-21)_
- `4301fa286` fix(web2) audit-r5: fb-posts read GETs gate requireWeb2AuthSoft + inventory-tracking limit/offset clamp (DoS/NaN) _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-132243-db41242` cho Claude walk chain theo CLAUDE.md protocol.
