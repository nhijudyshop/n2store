# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-092929-195f358`
**Session file**: [`./20260615-092929-195f358.md`](../20260615-092929-195f358.md)
**Commit**: `195f358` — docs(dev-log): TPOS đợt 2 deployed + verified (env dead removed, batch endpoints live)
**Last updated**: 2026-06-15 09:29:29 +07
**Summary**: docs(dev-log): TPOS đợt 2 deployed + verified (env dead removed, batch endpoints live)

## Files changed in this commit (`live-chat/`)

- `live-chat/chat.html`
- `live-chat/index.html`

## Last 5 commits touching `live-chat/`

- `e9f04d251` refactor(web2): gỡ TPOS khỏi Web 2.0 (token-manager/facebook-routes/Live*ODATA/getToken/deeplink) + fix N+1 enrich comment *(2026-06-14)\_
- `4a175cd12` auto: session update _(2026-06-14)_
- `a5d0f7abb` perf(web2,wallet-pill): gom N request /by-phone → 1 POST /batch-summary + browser-verify Firebase removal sạch _(2026-06-14)_
- `5f112e59e` feat(live-chat): status KH từ kho web2 + bidirectional sync (LiveStatus + LiveCustomerSync shared) _(2026-06-14)_
- `615238b54` auto: session update _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-092929-195f358` cho Claude walk chain theo CLAUDE.md protocol.
