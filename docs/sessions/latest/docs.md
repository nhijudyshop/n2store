# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-222555-a56562d`
**Session file**: [`./20260628-222555-a56562d.md`](../20260628-222555-a56562d.md)
**Commit**: `a56562d` — fix(so-order): server-authoritative sync — wipe DB sticks (kill local-first footgun)
**Last updated**: 2026-06-28 22:25:55 +07
**Summary**: so-order server-authoritative: wipe DB sticks, kill local-first footgun (verified E2E)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `a56562d38` fix(so-order): server-authoritative sync — wipe DB sticks (kill local-first footgun) _(2026-06-28)_
- `7750323ea` chore(session): RESUME:20260628-220048-b1505d2 _(2026-06-28)_
- `b1505d248` feat(agent-tooling): ponytail lazy-senior-dev YAGNI mode (always-on) _(2026-06-28)_
- `c661d4440` chore(session): RESUME:20260628-214304-8f37cff _(2026-06-28)_
- `8f37cffac` feat(so-order): Dien ngau nhien bom nhieu data hon - LOAI bien the (Ao/Quan/Dam/Vay/Giay/Dep) tu ProductTypesCache + 12 NCC + 2-6 dong; reset-flow wipe target _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-222555-a56562d` cho Claude walk chain theo CLAUDE.md protocol.
