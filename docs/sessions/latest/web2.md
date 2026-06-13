# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-195102-123e6d5`
**Session file**: [`./20260613-195102-123e6d5.md`](../20260613-195102-123e6d5.md)
**Commit**: `123e6d5` — auto: session update
**Last updated**: 2026-06-13 19:51:02 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/admin-sse-monitor/index.html`
- `web2/audit-log/index.html`
- `web2/balance-history/index.html`
- `web2/ck-dashboard/index.html`
- `web2/customer-wallet/index.html`
- `web2/customers/index.html`
- `web2/dashboard/index.html`
- `web2/delivery-zone/index.html`
- `web2/fastsaleorder-delivery/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-refund/index.html`
- `web2/index.html`
- `web2/kpi/assignments.html`
- `web2/kpi/index.html`
- `web2/livestream-poller/index.html`
- `web2/login/index.html`
- `web2/notifications/index.html`
- `web2/overview/index.html`
- `web2/pancake-settings/index.html`
- `web2/photo-studio/index.html`
- `web2/printer-settings/index.html`
- `web2/product-category/index.html`
- `web2/products/index.html`
- `web2/purchase-refund/index.html`
- `web2/reconcile/index.html`
- `web2/report-delivery/index.html`
- `web2/report-revenue/index.html`
- `web2/returns/index.html`
- `web2/services-dashboard/index.html`
- `web2/shared/web2-auth.js`
- `web2/shared/web2-zalo-api.js`
- `web2/shared/web2-zalo.js`
- `web2/shared/zalo-chat/bubbles.js`
- `web2/shared/zalo-chat/chat-actions.js`
- `web2/shared/zalo-chat/chat-bubbles.css`
- `web2/shared/zalo-chat/chat-composer.css`
- `web2/shared/zalo-chat/chat-lightbox.css`
- `web2/shared/zalo-chat/chat-store.js`
- `web2/shared/zalo-chat/composer.js`
- `web2/shared/zalo-chat/emoji-picker.js`
- `web2/shared/zalo-chat/lightbox.js`
- `web2/shared/zalo-chat/reactions.js`
- `web2/shared/zalo-chat/realtime.js`
- `web2/shared/zalo-chat/sticker-picker.js`
- `web2/supplier-debt/index.html`
- `web2/supplier-wallet/index.html`
- `web2/users-permissions/index.html`
- `web2/users/index.html`
- `web2/variants/index.html`
- `web2/zalo/index.html`
- `web2/zalo/js/web2-zalo-app.js`

## Last 5 commits touching `web2/`

- `123e6d54a` auto: session update _(2026-06-13)_
- `63446c668` auto: session update _(2026-06-13)_
- `e0a74e0d0` feat(web2): bắt buộc đăng nhập — page guard redirect /web2/login khi chưa auth _(2026-06-13)_
- `124fe747f` refactor(web2): gỡ dead Firebase — 8 trang firebase-free + fix manual-deposit stale ledger _(2026-06-13)_
- `626b8af76` fix(web2-zalo): list nhom bo prefix nguoi gui khi trung ten nhom _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-195102-123e6d5` cho Claude walk chain theo CLAUDE.md protocol.
