# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-133010-66c749a`
**Session file**: [`./20260624-133010-66c749a.md`](../20260624-133010-66c749a.md)
**Commit**: `66c749a` — fix(web2/avatar): consistent default DiceBear avatar everywhere (footer + table + preview)
**Last updated**: 2026-06-24 13:30:10 +07
**Summary**: Avatar mặc định DiceBear đồng nhất (footer+bảng+preview) qua avatarUrlFor 1 nguồn

## Files changed in this commit (`web2/`)

- `web2/shared/web2-sidebar.js`
- `web2/shared/web2-user-profile.js`
- `web2/users/js/users-app.js`

## Last 5 commits touching `web2/`

- `66c749a42` fix(web2/avatar): consistent default DiceBear avatar everywhere (footer + table + preview) _(2026-06-24)_
- `c61fecd4f` feat(web2/profile): full DiceBear avatar customizer (schema-driven, all options per style) _(2026-06-24)_
- `87b4d15d3` fix(web2/ai-hub): remove 'trả phí' (paid) wording from Nano Banana UI _(2026-06-24)_
- `c76294fb6` feat(web2/ai-hub): YouMind-style preset modal (search+image+prompt+load-more), free chibi avatars, lightbox hardening _(2026-06-24)_
- `1edf73158` change(web2/users): lower min password length 8 -> 6 (MIN*PWD_LEN, FE+BE synced) *(2026-06-24)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-133010-66c749a` cho Claude walk chain theo CLAUDE.md protocol.
