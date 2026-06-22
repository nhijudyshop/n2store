# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-161937-23c783f`
**Session file**: [`./20260622-161937-23c783f.md`](../20260622-161937-23c783f.md)
**Commit**: `23c783f` — auto: session update
**Last updated**: 2026-06-22 16:19:37 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/css/transfer-stats.css`
- `web2/balance-history/css/web2-balance-history.css`
- `web2/balance-history/index.html`
- `web2/jt-tracking/css/jt-tracking.css`
- `web2/jt-tracking/index.html`
- `web2/purchase-refund/css/purchase-refund.css`
- `web2/reconcile/css/reconcile.css`
- `web2/reconcile/index.html`
- `web2/shared/web2-zalo-api.js`
- `web2/shared/zalo-chat/bubbles.js`
- `web2/shared/zalo-chat/chat-actions.js`
- `web2/shared/zalo-chat/chat-view.js`
- `web2/supplier-debt/css/styles.css`
- `web2/supplier-debt/index.html`
- `web2/supplier-wallet/css/supplier-wallet.css`
- `web2/supplier-wallet/index.html`
- `web2/users/css/users.css`

## Last 5 commits touching `web2/`

- `23c783fa7` auto: session update _(2026-06-22)_
- `88270de16` refactor(web2-css) toolbar tokenize (Step 8): fork filter bars → design tokens (border/surface/radius/gap), keep archetype + cache bump _(2026-06-22)_
- `f7b4ef136` auto: session update _(2026-06-22)_
- `516671deb` auto: session update _(2026-06-22)_
- `e3bfb8dc6` feat(web2-zalo): Phase 2b-rest — quick-reply save/'/' trigger, dynamic ZNS form, link preview card _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-161937-23c783f` cho Claude walk chain theo CLAUDE.md protocol.
