# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-164059-e7a767d`
**Session file**: [`./20260621-164059-e7a767d.md`](../20260621-164059-e7a767d.md)
**Commit**: `e7a767d` — feat(web2): TAG đơn hàng auto theo trigger + chặn PBH khi có SP chờ hàng
**Last updated**: 2026-06-21 16:40:59 +07
**Summary**: feat web2: TAG đơn hàng auto theo trigger + chặn PBH khi có SP chờ hàng (engine + route + cột Thẻ + trang Cấu hình)

## Files changed in this commit (`web2/`)

- `web2/order-tags/index.html`
- `web2/order-tags/js/order-tags-app.js`
- `web2/shared/web2-order-tag-pill.js`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `e7a767d77` feat(web2): TAG đơn hàng auto theo trigger + chặn PBH khi có SP chờ hàng _(2026-06-21)_
- `b9f567be7` fix(web2) audit-d: 9 money-path bugs (over-refund regression, PBH oversell/drift, wallet double-credit, sepay race) _(2026-06-21)_
- `2d86f265c` fix(web2) audit-r9: 16 bug (worker SSRF/log-leak, ZNS idempotency, SSE-notify, idempotency) _(2026-06-21)_
- `2dcf4b5a8` fix(web2) hotfix r8: ck-dashboard 401 — fetchJson gửi x-web2-token + lucide icon _(2026-06-21)_
- `1a411c409` fix(web2) audit-r8: 16 bug (Zalo double-enc CRIT, double-debit CRIT, secret/PII leaks, timeouts) _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-164059-e7a767d` cho Claude walk chain theo CLAUDE.md protocol.
