# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-135105-1a411c4`
**Session file**: [`./20260621-135105-1a411c4.md`](../20260621-135105-1a411c4.md)
**Commit**: `1a411c4` — fix(web2) audit-r8: 16 bug (Zalo double-enc CRIT, double-debit CRIT, secret/PII leaks, timeouts)
**Last updated**: 2026-06-21 13:51:05 +07
**Summary**: audit r8: 16 fix (Zalo double-enc CRIT, double-debit CRIT, token/PII leaks); 3 defer + SePay creds Web1 surface

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customers/index.html`
- `web2/customers/js/customers-events.js`
- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-invoice/pbh-render.js`
- `web2/jt-tracking/index.html`
- `web2/photo-studio/index.html`
- `web2/photo-studio/photo-studio-edit.js`
- `web2/shared/web2-customer-chat-core.js`

## Last 5 commits touching `web2/`

- `1a411c409` fix(web2) audit-r8: 16 bug (Zalo double-enc CRIT, double-debit CRIT, secret/PII leaks, timeouts) _(2026-06-21)_
- `db41242b1` fix(web2) audit-r7: 11 bug across cron/native-orders/so-order/auth/sepay/migrations _(2026-06-21)_
- `4e3b49217` fix(web2) audit-r6 K-stage1: fast-sale-orders client gửi x-web2-token (11 call site) _(2026-06-21)_
- `c0cf94762` fix(web2) audit-r6: CRITICAL ví trừ không atomic (returns) + 8 fix (auth/worker/DoS/SSE/popup/history) _(2026-06-21)_
- `9376200bf` fix(web2) audit-r4: video-tts copyToChannel fallback (Safari/iOS cu) _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-135105-1a411c4` cho Claude walk chain theo CLAUDE.md protocol.
