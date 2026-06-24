# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-121642-d2f11af`
**Session file**: [`./20260624-121642-d2f11af.md`](../20260624-121642-d2f11af.md)
**Commit**: `d2f11af` — feat(web2/users): hard-delete (purge) + restore for deactivated users
**Last updated**: 2026-06-24 12:16:42 +07
**Summary**: web2/users: revive-on-create, audit fixes, hard-delete/restore user vô hiệu

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `d2f11af68` feat(web2/users): hard-delete (purge) + restore for deactivated users _(2026-06-24)_
- `72d48943a` fix(web2/users): audit fixes — self-deactivate/demote guards, modal state, SSE/iframe staleness, avatar/ts, revive hardening _(2026-06-24)_
- `ba6a8ead5` fix(web2-users): revive soft-deleted user on create instead of 409 duplicate _(2026-06-24)_
- `48a4278f1` chore(session): RESUME:20260624-114023-e229c44 _(2026-06-24)_
- `e229c44e5` feat(web2/ai-presets): add Chibi category (photo -> chibi/Brawl Stars/figurine via Nano Banana) _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-121642-d2f11af` cho Claude walk chain theo CLAUDE.md protocol.
