# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-225658-7e6950d`
**Session file**: [`./20260628-225658-7e6950d.md`](../20260628-225658-7e6950d.md)
**Commit**: `7e6950d` — fix(so-order): audit fixes — per-unit QR on main receive path + orphan dropdown on modal close
**Last updated**: 2026-06-28 22:56:58 +07
**Summary**: Audit so-order từng tab/modal: fix per-unit QR receive path + orphan dropdown (verified live)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `7e6950dfe` fix(so-order): audit fixes — per-unit QR on main receive path + orphan dropdown on modal close _(2026-06-28)_
- `b196e414e` chore(session): RESUME:20260628-222555-a56562d _(2026-06-28)_
- `a56562d38` fix(so-order): server-authoritative sync — wipe DB sticks (kill local-first footgun) _(2026-06-28)_
- `7750323ea` chore(session): RESUME:20260628-220048-b1505d2 _(2026-06-28)_
- `b1505d248` feat(agent-tooling): ponytail lazy-senior-dev YAGNI mode (always-on) _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-225658-7e6950d` cho Claude walk chain theo CLAUDE.md protocol.
