# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-121927-cb305e9`
**Session file**: [`./20260620-121927-cb305e9.md`](../20260620-121927-cb305e9.md)
**Commit**: `cb305e9` — fix(bill): bo default account hardcode nvqldonhang/Aa@123456987 — chua gan TPOS thi bao 'khong ra bill'
**Last updated**: 2026-06-20 12:19:27 +07
**Summary**: fix(bill): bo default account hardcode nvqldonhang/Aa@123456987 — chua gan TPOS thi bao 'khong ra bill'

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `cb305e95f` fix(bill): bo default account hardcode nvqldonhang/Aa@123456987 — chua gan TPOS thi bao 'khong ra bill' _(2026-06-20)_
- `211aa2a57` chore(session): RESUME:20260620-120728-2704ef6 _(2026-06-20)_
- `2704ef6f0` fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password _(2026-06-20)_
- `95dc96af5` chore(session): RESUME:20260620-114903-65d6ba9 _(2026-06-20)_
- `65d6ba9b4` fix(web2): medium/low audit fixes (25 file) — leaks/races/guards + bump ?v=20260620c _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-121927-cb305e9` cho Claude walk chain theo CLAUDE.md protocol.
