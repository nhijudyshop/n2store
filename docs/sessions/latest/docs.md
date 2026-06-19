# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-070537-bd2c728`
**Session file**: [`./20260619-070537-bd2c728.md`](../20260619-070537-bd2c728.md)
**Commit**: `bd2c728` — refactor(web2): tách web2-customer-chat.js (842) → 3 module MOVE-only (4-consumer) — chat-infra XONG
**Last updated**: 2026-06-19 07:05:37 +07
**Summary**: Modularization Web2 gần xong: 30 oversized→4. Live-chat cluster + chat-infra shared XONG. Còn native-orders surgery (eyeball) + server.js deferred

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/WEB2-CODEMAP.md`
- `docs/web2/web2-codemap.json`

## Last 5 commits touching `docs/`

- `bd2c728e9` refactor(web2): tách web2-customer-chat.js (842) → 3 module MOVE-only (4-consumer) — chat-infra XONG _(2026-06-19)_
- `0fe230cd0` refactor(web2): tách web2-chat-panel.js (1049) → 4 module MOVE-only (3-consumer) _(2026-06-19)_
- `00294aaa2` refactor(web2): tách web2-chat-client.js (1199) → 7 module MOVE-only (10-consumer) _(2026-06-19)_
- `b4b637819` refactor(live-chat): tách live-init.js (1137) → 4 module MOVE-only — live-chat cluster XONG _(2026-06-19)_
- `e0240faa9` refactor(live-chat): tách pancake-token-manager.js (1310) → 6 module (class-split) MOVE-only _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-070537-bd2c728` cho Claude walk chain theo CLAUDE.md protocol.
