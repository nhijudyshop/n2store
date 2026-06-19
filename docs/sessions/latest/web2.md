# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-070537-bd2c728`
**Session file**: [`./20260619-070537-bd2c728.md`](../20260619-070537-bd2c728.md)
**Commit**: `bd2c728` — refactor(web2): tách web2-customer-chat.js (842) → 3 module MOVE-only (4-consumer) — chat-infra XONG
**Last updated**: 2026-06-19 07:05:37 +07
**Summary**: Modularization Web2 gần xong: 30 oversized→4. Live-chat cluster + chat-infra shared XONG. Còn native-orders surgery (eyeball) + server.js deferred

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customers/index.html`
- `web2/jt-tracking/index.html`
- `web2/multi-tool/index.html`
- `web2/pancake-settings/index.html`
- `web2/shared/chat-panel/web2-chat-panel-compose.js`
- `web2/shared/chat-panel/web2-chat-panel-render.js`
- `web2/shared/chat-panel/web2-chat-panel-state.js`
- `web2/shared/chat-panel/web2-chat-panel.js`
- `web2/shared/web2-chat-api.js`
- `web2/shared/web2-chat-client.js`
- `web2/shared/web2-chat-live.js`
- `web2/shared/web2-chat-settings.js`
- `web2/shared/web2-chat-tags.js`
- `web2/shared/web2-chat-tokens.js`
- `web2/shared/web2-chat-utils.js`
- `web2/shared/web2-customer-chat-core.js`
- `web2/shared/web2-customer-chat-modal.js`
- `web2/shared/web2-customer-chat.js`

## Last 5 commits touching `web2/`

- `bd2c728e9` refactor(web2): tách web2-customer-chat.js (842) → 3 module MOVE-only (4-consumer) — chat-infra XONG _(2026-06-19)_
- `0fe230cd0` refactor(web2): tách web2-chat-panel.js (1049) → 4 module MOVE-only (3-consumer) _(2026-06-19)_
- `00294aaa2` refactor(web2): tách web2-chat-client.js (1199) → 7 module MOVE-only (10-consumer) _(2026-06-19)_
- `156a906c9` refactor(web2): Wave 3 batch C — photo-studio(2348→7) + products-app(2010→7) + msg-template(961→4) MOVE-only _(2026-06-18)_
- `b5385374f` refactor(web2): Wave 3 batch B — reconcile(1106→5) + pancake-settings(1305→5) + purchase-refund(1634→6) MOVE-only _(2026-06-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-070537-bd2c728` cho Claude walk chain theo CLAUDE.md protocol.
