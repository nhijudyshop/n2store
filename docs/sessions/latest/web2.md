# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-114023-e229c44`
**Session file**: [`./20260624-114023-e229c44.md`](../20260624-114023-e229c44.md)
**Commit**: `e229c44` — feat(web2/ai-presets): add Chibi category (photo -> chibi/Brawl Stars/figurine via Nano Banana)
**Last updated**: 2026-06-24 11:40:23 +07
**Summary**: feat(web2/ai-presets): add Chibi category (photo -> chibi/Brawl Stars/figurine via Nano Banana)

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/shared/web2-ai-presets.js`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `e229c44e5` feat(web2/ai-presets): add Chibi category (photo -> chibi/Brawl Stars/figurine via Nano Banana) _(2026-06-24)_
- `4bac6625f` chore(web2/users): prettier format users-app.js _(2026-06-24)_
- `a2d0d9c59` fix(web2/users): perms tab scroll (iframe embed clip) + đổi mật khẩu trong modal Sửa + hiện MK cột _(2026-06-24)_
- `302b54408` fix(web2): VieNeu registry -> Postgres (fix multi-instance) + ChatAnywhere provider + preset thumbnails _(2026-06-24)_
- `f0637de38` feat(web2): expand AI presets shared module — +6 chat roles, dual global, sidebar autoload _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-114023-e229c44` cho Claude walk chain theo CLAUDE.md protocol.
