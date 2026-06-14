# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260614-194537-4a175cd`
**Session file**: [`./20260614-194537-4a175cd.md`](../20260614-194537-4a175cd.md)
**Commit**: `4a175cd` — auto: session update
**Last updated**: 2026-06-14 19:45:37 +07
**Summary**: auto: session update

## Files changed in this commit (`live-chat/`)

- `live-chat/index.html`
- `live-chat/js/api-config.js`
- `live-chat/js/live/live-api.js`
- `live-chat/js/live/live-init.js`
- `live-chat/server/facebook-routes.js`

## Last 5 commits touching `live-chat/`

- `4a175cd12` auto: session update _(2026-06-14)_
- `a5d0f7abb` perf(web2,wallet-pill): gom N request /by-phone → 1 POST /batch-summary + browser-verify Firebase removal sạch _(2026-06-14)_
- `5f112e59e` feat(live-chat): status KH từ kho web2 + bidirectional sync (LiveStatus + LiveCustomerSync shared) _(2026-06-14)_
- `615238b54` auto: session update _(2026-06-14)_
- `805a08866` fix(web2-split): route delivery-invoices/refunds to web2-api + repoint hardcoded web2→fallback URLs _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260614-194537-4a175cd` cho Claude walk chain theo CLAUDE.md protocol.
