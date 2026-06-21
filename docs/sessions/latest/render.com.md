# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-004507-c538ee8`
**Session file**: [`./20260622-004507-c538ee8.md`](../20260622-004507-c538ee8.md)
**Commit**: `c538ee8` — fix(web2) SSE r2: wildcard/broadcast forward (fix ví regression) + shutdown await + liveness timeout
**Last updated**: 2026-06-22 00:45:07 +07
**Summary**: fix(web2) SSE r2: wildcard/broadcast forward (fix ví regression) + shutdown await + liveness timeout

## Files changed in this commit (`render.com/`)

- `render.com/routes/realtime-sse-web2.js`
- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `c538ee89b` fix(web2) SSE r2: wildcard/broadcast forward (fix ví regression) + shutdown await + liveness timeout _(2026-06-22)_
- `4960f1ba5` fix(web2) SSE: vá 18 finding audit cross-instance (double-deliver, reconnect, pool churn, keepalive, log noise, shutdown) _(2026-06-22)_
- `0898d3a28` fix(web2) SSE: BOOT*ID luôn random suffix (slice RENDER_INSTANCE_ID có thể trùng service-id giữa instance → fan-out vỡ) *(2026-06-22)\_
- `c196d5cdf` feat(web2) SSE: crossStats (published/received/deliveredFromPeers) trong /sse/stats — verify vòng LISTEN/NOTIFY sống _(2026-06-22)_
- `d67750435` fix(web2) SSE realtime backbone: cross-instance fan-out (Postgres LISTEN/NOTIFY) + observability + graceful deploy _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-004507-c538ee8` cho Claude walk chain theo CLAUDE.md protocol.
