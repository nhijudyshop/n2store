# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-093107-a7c0b30`
**Session file**: [`./20260621-093107-a7c0b30.md`](../20260621-093107-a7c0b30.md)
**Commit**: `a7c0b30` — docs(dev-log): audit round 3 (so-order cost CRIT + native/SSE/KPI/a11y, 12 fix)
**Last updated**: 2026-06-21 09:31:07 +07
**Summary**: audit r3: so-order footer cost-price CRIT + native renderRows/STT + SSE relay hardening + KPI tz + XSS/a11y (12 fix)

## Files changed in this commit (`web2/`)

- `web2/purchase-refund/css/purchase-refund.css`
- `web2/purchase-refund/index.html`
- `web2/report-revenue/index.html`

## Last 5 commits touching `web2/`

- `b6eeb56dc` fix(web2) audit-r3: so-order footer cost-price (CRIT) + native-orders renderRows/STT + SSE relay hardening + KPI tz + XSS/a11y _(2026-06-21)_
- `10c511fba` fix(web2) audit-r2b: reconcile audit date filter dung GMT+7 (khong theo TZ trinh duyet) _(2026-06-21)_
- `93bde3438` fix(web2) audit-r2a: auth-gate batch read endpoints (PII/wallet) + XSS multi-tool _(2026-06-21)_
- `77bdd329c` fix(web2) audit-r1f: frontend minor (r.ok check, tz GMT+7, so-order race) _(2026-06-21)_
- `550719520` fix(web2) audit-r1e: click-path double-submit/dup-listener _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-093107-a7c0b30` cho Claude walk chain theo CLAUDE.md protocol.
