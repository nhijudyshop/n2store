# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-160121-f1e4262`
**Session file**: [`./20260622-160121-f1e4262.md`](../20260622-160121-f1e4262.md)
**Commit**: `f1e4262` — auto: session update
**Last updated**: 2026-06-22 16:01:21 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/js/web2-manual-deposit.js`
- `web2/customers/css/customers.css`
- `web2/jt-tracking/css/jt-tracking.css`
- `web2/products/css/web2-products.css`
- `web2/purchase-refund/css/purchase-refund.css`
- `web2/reconcile/css/reconcile.css`
- `web2/shared/web2-zalo-api.js`
- `web2/shared/web2-zalo.js`
- `web2/shared/zalo-chat/bubbles.js`
- `web2/shared/zalo-chat/chat-bubbles.css`
- `web2/shared/zalo-chat/composer.js`
- `web2/supplier-debt/css/styles.css`
- `web2/supplier-wallet/css/supplier-wallet.css`
- `web2/users/css/users.css`
- `web2/video-maker/index.html`
- `web2/video-maker/js/video-library.js`
- `web2/video-maker/js/video-tts.js`
- `web2/zalo/css/web2-zalo.css`
- `web2/zalo/index.html`
- `web2/zalo/js/web2-zalo-lookup-zns.js`

## Last 5 commits touching `web2/`

- `f1e42624a` auto: session update _(2026-06-22)_
- `50de1c1ec` feat(web2-video-maker): frontend "Giọng AI Pro" engine + tab kho giọng (mặc định Adam 3, giấu nhà cung cấp) _(2026-06-22)_
- `db7409565` auto: session update _(2026-06-22)_
- `664f1b739` feat(web2-zalo) Phase2b core: tin-mới notify (toast/beep/tab-badge/web-notif) + quản lý hội thoại ghim/mute/đánh-dấu-chưa-đọc _(2026-06-22)_
- `f4892eded` auto: session update _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-160121-f1e4262` cho Claude walk chain theo CLAUDE.md protocol.
