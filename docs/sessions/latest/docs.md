# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-150331-70e32bb`
**Session file**: [`./20260605-150331-70e32bb.md`](../20260605-150331-70e32bb.md)
**Commit**: `70e32bb` — refactor(web2): unread logic authoritative thuần (bỏ mirror Web 1.0 + nút Đã đọc)
**Last updated**: 2026-06-05 15:03:31 +07
**Summary**: refactor(web2): unread logic authoritative thuần (bỏ mirror Web 1.0 + nút Đã đọc)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `70e32bb69` refactor(web2): unread logic authoritative thuần (bỏ mirror Web 1.0 + nút Đã đọc) _(2026-06-05)_
- `fdb267eaa` fix(orders): KPI thuc tru nham don hoan co KPI goc=0 (cap loss <= order.kpi) _(2026-06-05)_
- `69ee9f897` chore(session): RESUME:20260605-150051-4a24b56 _(2026-06-05)_
- `73b504f69` docs(dev-log): bill ten nguoi ban = user login + card dang nhap overview _(2026-06-05)_
- `424a76a8c` chore(session): RESUME:20260605-145543-3de04fa _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-150331-70e32bb` cho Claude walk chain theo CLAUDE.md protocol.
