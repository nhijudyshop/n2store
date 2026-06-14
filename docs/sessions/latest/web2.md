# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260614-194537-4a175cd`
**Session file**: [`./20260614-194537-4a175cd.md`](../20260614-194537-4a175cd.md)
**Commit**: `4a175cd` — auto: session update
**Last updated**: 2026-06-14 19:45:37 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/customer-wallet-app.js`
- `web2/customers/index.html`
- `web2/shared/web2-customer-lookup.js`
- `web2/shared/web2-deeplink.js`
- `web2/shared/zalo-chat/chat-view.js`
- `web2/supplier-debt/index.html`
- `web2/zalo/index.html`
- `web2/zalo/js/web2-zalo-app.js`

## Last 5 commits touching `web2/`

- `4a175cd12` auto: session update _(2026-06-14)_
- `bdc3e869f` fix(web2-zalo): heal tên hội thoại USER 1-1 bị thành tên SHOP (shop nhắn cuối) _(2026-06-14)_
- `cee3b76ab` auto: session update _(2026-06-14)_
- `c07c03da5` chore(web2): xoá dead code web2-bulk-import.js + selector mồ côi .w2-bulk-modal _(2026-06-14)_
- `a5d0f7abb` perf(web2,wallet-pill): gom N request /by-phone → 1 POST /batch-summary + browser-verify Firebase removal sạch _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260614-194537-4a175cd` cho Claude walk chain theo CLAUDE.md protocol.
