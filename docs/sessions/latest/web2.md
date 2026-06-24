# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-130006-c76294f`
**Session file**: [`./20260624-130006-c76294f.md`](../20260624-130006-c76294f.md)
**Commit**: `c76294f` — feat(web2/ai-hub): YouMind-style preset modal (search+image+prompt+load-more), free chibi avatars, lightbox hardening
**Last updated**: 2026-06-24 13:00:06 +07
**Summary**: AI presets modal YouMind-style (search+image+prompt+load-more), free chibi avatars, lightbox hardening, ChatAnywhere keys

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/shared/web2-ai-presets.js`
- `web2/shared/web2-image-lightbox.js`
- `web2/shared/web2-sidebar.js`
- `web2/shared/web2-user-profile.js`

## Last 5 commits touching `web2/`

- `c76294fb6` feat(web2/ai-hub): YouMind-style preset modal (search+image+prompt+load-more), free chibi avatars, lightbox hardening _(2026-06-24)_
- `1edf73158` change(web2/users): lower min password length 8 -> 6 (MIN*PWD_LEN, FE+BE synced) *(2026-06-24)\_
- `d2f11af68` feat(web2/users): hard-delete (purge) + restore for deactivated users _(2026-06-24)_
- `72d48943a` fix(web2/users): audit fixes — self-deactivate/demote guards, modal state, SSE/iframe staleness, avatar/ts, revive hardening _(2026-06-24)_
- `e229c44e5` feat(web2/ai-presets): add Chibi category (photo -> chibi/Brawl Stars/figurine via Nano Banana) _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-130006-c76294f` cho Claude walk chain theo CLAUDE.md protocol.
