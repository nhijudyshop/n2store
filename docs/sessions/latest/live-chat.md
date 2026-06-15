# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-113951-d9e8857`
**Session file**: [`./20260615-113951-d9e8857.md`](../20260615-113951-d9e8857.md)
**Commit**: `d9e8857` — docs(dev-log): J&T follow-up — KPI Đã duyệt + fix input + fix chat drawer text dọc
**Last updated**: 2026-06-15 11:39:51 +07
**Summary**: docs(dev-log): J&T follow-up — KPI Đã duyệt + fix input + fix chat drawer text dọc

## Files changed in this commit (`live-chat/`)

- `live-chat/index.html`
- `live-chat/js/live/live-comment-list.js`

## Last 5 commits touching `live-chat/`

- `5c4244975` fix(live-chat): comment mới APPEND đúng vị trí incremental — KHÔNG full re-render (user) _(2026-06-15)_
- `5f21a33a0` refactor(live-chat): gỡ client poll-now warm-up → server-direct WS per-page (user) + note 2 trang _(2026-06-15)_
- `4304ce7d6` fix(web2-realtime): /api/pages-available discover allPages on-demand (đường Postgres fallback không set) — UI checkbox liệt kê đủ trang _(2026-06-15)_
- `603a57073` fix(live-chat): comment livestream về 2 trang Live — relay join per-page pages:{id} + UI chọn trang _(2026-06-15)_
- `e9f04d251` refactor(web2): gỡ TPOS khỏi Web 2.0 (token-manager/facebook-routes/Live*ODATA/getToken/deeplink) + fix N+1 enrich comment *(2026-06-14)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-113951-d9e8857` cho Claude walk chain theo CLAUDE.md protocol.
