# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-122635-1edf731`
**Session file**: [`./20260624-122635-1edf731.md`](../20260624-122635-1edf731.md)
**Commit**: `1edf731` — change(web2/users): lower min password length 8 -> 6 (MIN_PWD_LEN, FE+BE synced)
**Last updated**: 2026-06-24 12:26:35 +07
**Summary**: web2/users: hạ min mật khẩu 8->6 ký tự (FE+BE), verified 6-char OK

## Files changed in this commit (`web2/`)

- `web2/users/index.html`
- `web2/users/js/users-app.js`

## Last 5 commits touching `web2/`

- `1edf73158` change(web2/users): lower min password length 8 -> 6 (MIN*PWD_LEN, FE+BE synced) *(2026-06-24)\_
- `d2f11af68` feat(web2/users): hard-delete (purge) + restore for deactivated users _(2026-06-24)_
- `72d48943a` fix(web2/users): audit fixes — self-deactivate/demote guards, modal state, SSE/iframe staleness, avatar/ts, revive hardening _(2026-06-24)_
- `e229c44e5` feat(web2/ai-presets): add Chibi category (photo -> chibi/Brawl Stars/figurine via Nano Banana) _(2026-06-24)_
- `4bac6625f` chore(web2/users): prettier format users-app.js _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-122635-1edf731` cho Claude walk chain theo CLAUDE.md protocol.
