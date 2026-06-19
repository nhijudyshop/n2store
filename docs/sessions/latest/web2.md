# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-075807-111b43e`
**Session file**: [`./20260619-075807-111b43e.md`](../20260619-075807-111b43e.md)
**Commit**: `111b43e` — docs(web2): mark native-orders split + Task 1 chat-unification done; note Step 2b deferred (entangled)
**Last updated**: 2026-06-19 07:58:07 +07
**Summary**: native-orders 9457→23 split + Task 1 chat-unification (Web2CustomerChat, comments→info) XONG. Modularization Web2 hoàn tất; còn Step 2b dead-code + server.js deferred

## Files changed in this commit (`web2/`)

- `web2/shared/web2-customer-chat-core.js`
- `web2/shared/web2-customer-chat-modal.js`

## Last 5 commits touching `web2/`

- `d6c0c7b71` feat(native-orders): Task 1 — chat-unification, openInteractions → Web2CustomerChat (comments → info col) _(2026-06-19)_
- `bd2c728e9` refactor(web2): tách web2-customer-chat.js (842) → 3 module MOVE-only (4-consumer) — chat-infra XONG _(2026-06-19)_
- `0fe230cd0` refactor(web2): tách web2-chat-panel.js (1049) → 4 module MOVE-only (3-consumer) _(2026-06-19)_
- `00294aaa2` refactor(web2): tách web2-chat-client.js (1199) → 7 module MOVE-only (10-consumer) _(2026-06-19)_
- `156a906c9` refactor(web2): Wave 3 batch C — photo-studio(2348→7) + products-app(2010→7) + msg-template(961→4) MOVE-only _(2026-06-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-075807-111b43e` cho Claude walk chain theo CLAUDE.md protocol.
