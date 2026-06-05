# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-163842-39025e6`
**Session file**: [`./20260605-163842-39025e6.md`](../20260605-163842-39025e6.md)
**Commit**: `39025e6` — feat(web2 pancake): server-side auto-refresh token — login service + creds encryption + cron
**Last updated**: 2026-06-05 16:38:42 +07
**Summary**: feat(web2 pancake): server-side auto-refresh token — login service + creds encryption + cron

## Files changed in this commit (`scripts/`)

- `scripts/pancake-login-capture.js`
- `scripts/pancake-token-harvester.js`
- `scripts/test-web2-unread-reconcile.js`

## Last 5 commits touching `scripts/`

- `0bb4c2845` feat(web2): unread reconcile — fix row chưa đọc kẹt sau khi đã đọc trên Pancake _(2026-06-05)_
- `272ce994e` feat(web2 pancake): auto-login refresh token — harvester + server-side request flow _(2026-06-05)_
- `551ddbf82` fix(web2): detect 'KH báo đã CK' cả trên update*conversation (fix bỏ sót) *(2026-06-05)\_
- `70e32bb69` refactor(web2): unread logic authoritative thuần (bỏ mirror Web 1.0 + nút Đã đọc) _(2026-06-05)_
- `528b07a1c` feat(web2): unread DB riêng Web 2.0 + harden Pancake WS 24/7 _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-163842-39025e6` cho Claude walk chain theo CLAUDE.md protocol.
