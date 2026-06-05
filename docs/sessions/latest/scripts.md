# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-170802-661e80a`
**Session file**: [`./20260605-170802-661e80a.md`](../20260605-170802-661e80a.md)
**Commit**: `661e80a` — auto: session update
**Last updated**: 2026-06-05 17:08:02 +07
**Summary**: auto: session update

## Files changed in this commit (`scripts/`)

- `scripts/test-payment-signals.js`

## Last 5 commits touching `scripts/`

- `661e80a1c` auto: session update _(2026-06-05)_
- `0bb4c2845` feat(web2): unread reconcile — fix row chưa đọc kẹt sau khi đã đọc trên Pancake _(2026-06-05)_
- `272ce994e` feat(web2 pancake): auto-login refresh token — harvester + server-side request flow _(2026-06-05)_
- `551ddbf82` fix(web2): detect 'KH báo đã CK' cả trên update*conversation (fix bỏ sót) *(2026-06-05)\_
- `70e32bb69` refactor(web2): unread logic authoritative thuần (bỏ mirror Web 1.0 + nút Đã đọc) _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-170802-661e80a` cho Claude walk chain theo CLAUDE.md protocol.
