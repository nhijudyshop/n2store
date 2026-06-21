# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-201052-bde0e54`
**Session file**: [`./20260621-201052-bde0e54.md`](../20260621-201052-bde0e54.md)
**Commit**: `bde0e54` — fix(web2-shell): GLOBAL ≤900px main full-width trên mọi trang (sửa flex-direction no-op)
**Last updated**: 2026-06-21 20:10:52 +07
**Summary**: GLOBAL fix: web2 shell ≤900px main full-width (mọi trang tablet/phone) + bump theme v

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `bde0e54ae` fix(web2-shell): GLOBAL ≤900px main full-width trên mọi trang (sửa flex-direction no-op) _(2026-06-21)_
- `db41242b1` fix(web2) audit-r7: 11 bug across cron/native-orders/so-order/auth/sepay/migrations _(2026-06-21)_
- `c0cf94762` fix(web2) audit-r6: CRITICAL ví trừ không atomic (returns) + 8 fix (auth/worker/DoS/SSE/popup/history) _(2026-06-21)_
- `b6eeb56dc` fix(web2) audit-r3: so-order footer cost-price (CRIT) + native-orders renderRows/STT + SSE relay hardening + KPI tz + XSS/a11y _(2026-06-21)_
- `77bdd329c` fix(web2) audit-r1f: frontend minor (r.ok check, tz GMT+7, so-order race) _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-201052-bde0e54` cho Claude walk chain theo CLAUDE.md protocol.
