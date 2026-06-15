# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-110838-5ffd478`
**Session file**: [`./20260615-110838-5ffd478.md`](../20260615-110838-5ffd478.md)
**Commit**: `5ffd478` — feat(web2-jt): auto-ingest mã J&T từ tin nhắn nhóm Zalo realtime + fix sidebar mount
**Last updated**: 2026-06-15 11:08:38 +07
**Summary**: feat(web2-jt): auto-ingest mã J&T từ tin nhắn nhóm Zalo realtime + fix sidebar mount

## Files changed in this commit (`live-chat/`)

- `live-chat/comments-mobile.html`
- `live-chat/index.html`
- `live-chat/js/live/comments-mobile.js`
- `live-chat/js/live/live-init.js`
- `live-chat/server/server.js`

## Last 5 commits touching `live-chat/`

- `5f21a33a0` refactor(live-chat): gỡ client poll-now warm-up → server-direct WS per-page (user) + note 2 trang _(2026-06-15)_
- `4304ce7d6` fix(web2-realtime): /api/pages-available discover allPages on-demand (đường Postgres fallback không set) — UI checkbox liệt kê đủ trang _(2026-06-15)_
- `603a57073` fix(live-chat): comment livestream về 2 trang Live — relay join per-page pages:{id} + UI chọn trang _(2026-06-15)_
- `e9f04d251` refactor(web2): gỡ TPOS khỏi Web 2.0 (token-manager/facebook-routes/Live*ODATA/getToken/deeplink) + fix N+1 enrich comment *(2026-06-14)\_
- `4a175cd12` auto: session update _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-110838-5ffd478` cho Claude walk chain theo CLAUDE.md protocol.
