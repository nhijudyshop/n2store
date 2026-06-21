# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-164059-e7a767d`
**Session file**: [`./20260621-164059-e7a767d.md`](../20260621-164059-e7a767d.md)
**Commit**: `e7a767d` — feat(web2): TAG đơn hàng auto theo trigger + chặn PBH khi có SP chờ hàng
**Last updated**: 2026-06-21 16:40:59 +07
**Summary**: feat web2: TAG đơn hàng auto theo trigger + chặn PBH khi có SP chờ hàng (engine + route + cột Thẻ + trang Cấu hình)

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-bulk-operations.js`
- `native-orders/js/native-orders-pbh-bill.js`
- `native-orders/js/native-orders-realtime-init.js`
- `native-orders/js/native-orders-render.js`
- `native-orders/js/native-orders-state.js`

## Last 5 commits touching `native-orders/`

- `e7a767d77` feat(web2): TAG đơn hàng auto theo trigger + chặn PBH khi có SP chờ hàng _(2026-06-21)_
- `2d86f265c` fix(web2) audit-r9: 16 bug (worker SSRF/log-leak, ZNS idempotency, SSE-notify, idempotency) _(2026-06-21)_
- `1a411c409` fix(web2) audit-r8: 16 bug (Zalo double-enc CRIT, double-debit CRIT, secret/PII leaks, timeouts) _(2026-06-21)_
- `db41242b1` fix(web2) audit-r7: 11 bug across cron/native-orders/so-order/auth/sepay/migrations _(2026-06-21)_
- `4e3b49217` fix(web2) audit-r6 K-stage1: fast-sale-orders client gửi x-web2-token (11 call site) _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-164059-e7a767d` cho Claude walk chain theo CLAUDE.md protocol.
