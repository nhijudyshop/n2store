# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-122635-1edf731`
**Session file**: [`./20260624-122635-1edf731.md`](../20260624-122635-1edf731.md)
**Commit**: `1edf731` — change(web2/users): lower min password length 8 -> 6 (MIN_PWD_LEN, FE+BE synced)
**Last updated**: 2026-06-24 12:26:35 +07
**Summary**: web2/users: hạ min mật khẩu 8->6 ký tự (FE+BE), verified 6-char OK

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-users.js`

## Last 5 commits touching `render.com/`

- `1edf73158` change(web2/users): lower min password length 8 -> 6 (MIN*PWD_LEN, FE+BE synced) *(2026-06-24)\_
- `d2f11af68` feat(web2/users): hard-delete (purge) + restore for deactivated users _(2026-06-24)_
- `72d48943a` fix(web2/users): audit fixes — self-deactivate/demote guards, modal state, SSE/iframe staleness, avatar/ts, revive hardening _(2026-06-24)_
- `ba6a8ead5` fix(web2-users): revive soft-deleted user on create instead of 409 duplicate _(2026-06-24)_
- `302b54408` fix(web2): VieNeu registry -> Postgres (fix multi-instance) + ChatAnywhere provider + preset thumbnails _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-122635-1edf731` cho Claude walk chain theo CLAUDE.md protocol.
