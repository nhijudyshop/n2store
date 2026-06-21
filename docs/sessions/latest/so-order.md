# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-123747-b32b578`
**Session file**: [`./20260621-123747-b32b578.md`](../20260621-123747-b32b578.md)
**Commit**: `b32b578` — fix(web2) audit-r6 K-stage2: gate 13 fast-sale-orders mutation route requireWeb2AuthSoft
**Last updated**: 2026-06-21 12:37:47 +07
**Summary**: audit r6: 14 bug fix (CRITICAL ví atomic, fast-sale-orders auth+stock-race, +9)

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `c0cf94762` fix(web2) audit-r6: CRITICAL ví trừ không atomic (returns) + 8 fix (auth/worker/DoS/SSE/popup/history) _(2026-06-21)_
- `b6eeb56dc` fix(web2) audit-r3: so-order footer cost-price (CRIT) + native-orders renderRows/STT + SSE relay hardening + KPI tz + XSS/a11y _(2026-06-21)_
- `77bdd329c` fix(web2) audit-r1f: frontend minor (r.ok check, tz GMT+7, so-order race) _(2026-06-21)_
- `341141081` fix(web2) audit-r1a: QR-write auth + live-comments seq/N+1 + relay 401 log + so-order conflict timer _(2026-06-20)_
- `784b6d0e7` fix(web2): cache tu nap Web2ProductsApi (shared) -> picker load SP khong can vao Kho SP truoc _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-123747-b32b578` cho Claude walk chain theo CLAUDE.md protocol.
