# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260614-151841-7f0f8d0`
**Session file**: [`./20260614-151841-7f0f8d0.md`](../20260614-151841-7f0f8d0.md)
**Commit**: `7f0f8d0` — docs(render): ghi lại tách web2-api (Web1⊥Web2 service split) — dev-log + RENDER_SERVERS_GUIDE
**Last updated**: 2026-06-14 15:18:41 +07
**Summary**: docs(render): ghi lại tách web2-api (Web1⊥Web2 service split) — dev-log + RENDER_SERVERS_GUIDE

## Files changed in this commit (`render.com/`)

- `render.com/migrations/077_create_kpi_livestream_flag.sql`
- `render.com/routes/livestream-snapshots.js`
- `render.com/routes/realtime-db.js`
- `render.com/routes/web2-zalo.js`
- `render.com/run-migration-077.js`

## Last 5 commits touching `render.com/`

- `805a08866` fix(web2-split): route delivery-invoices/refunds to web2-api + repoint hardcoded web2→fallback URLs _(2026-06-14)_
- `ddf786dff` feat(orders-report): cột BH (bán thêm livestream) + tab KPI Livestream _(2026-06-14)_
- `58af65dee` feat(render): WEB2*ONLY + DISABLE_WEB2_JOBS flags để tách web2-api khỏi n2store-fallback *(2026-06-14)\_
- `43ba24d53` feat(web2): gộp services-dashboard + admin-sse-monitor → trang Cấu hình & Hệ thống _(2026-06-14)_
- `0a778ba96` feat(delivery-report): nut Anh TMT/NAP gui kem file Excel cung anh vao Telegram (send-document + v=20260614b) _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260614-151841-7f0f8d0` cho Claude walk chain theo CLAUDE.md protocol.
