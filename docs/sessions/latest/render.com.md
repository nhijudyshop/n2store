# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260614-153132-615238b`
**Session file**: [`./20260614-153132-615238b.md`](../20260614-153132-615238b.md)
**Commit**: `615238b` — auto: session update
**Last updated**: 2026-06-14 15:31:32 +07
**Summary**: auto: session update

## Files changed in this commit (`render.com/`)

- `render.com/routes/realtime-sse-web2.js`
- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `b5d5a5056` feat(web2-sse): cross-instance forward notify fallback→web2-api (fix SePay realtime) _(2026-06-14)_
- `805a08866` fix(web2-split): route delivery-invoices/refunds to web2-api + repoint hardcoded web2→fallback URLs _(2026-06-14)_
- `ddf786dff` feat(orders-report): cột BH (bán thêm livestream) + tab KPI Livestream _(2026-06-14)_
- `58af65dee` feat(render): WEB2*ONLY + DISABLE_WEB2_JOBS flags để tách web2-api khỏi n2store-fallback *(2026-06-14)\_
- `43ba24d53` feat(web2): gộp services-dashboard + admin-sse-monitor → trang Cấu hình & Hệ thống _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260614-153132-615238b` cho Claude walk chain theo CLAUDE.md protocol.
