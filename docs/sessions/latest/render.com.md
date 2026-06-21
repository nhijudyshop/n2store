# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-005451-7cac4da`
**Session file**: [`./20260622-005451-7cac4da.md`](../20260622-005451-7cac4da.md)
**Commit**: `7cac4da` — docs(web2) dev-log: SSE realtime backbone cross-instance fan-out + 3 review rounds (19->6->4)
**Last updated**: 2026-06-22 00:54:51 +07
**Summary**: fix(web2) SSE realtime backbone: cross-instance fan-out Postgres LISTEN/NOTIFY + observability + graceful deploy + 3 review rounds (19→6→4 finding hội tụ)

## Files changed in this commit (`render.com/`)

- `render.com/routes/realtime-sse-web2.js`

## Last 5 commits touching `render.com/`

- `40d96edb3` fix(web2) SSE r3: gracefulClose .end() timeout + liveness timer unref + broadcast event whitelist _(2026-06-22)_
- `c538ee89b` fix(web2) SSE r2: wildcard/broadcast forward (fix ví regression) + shutdown await + liveness timeout _(2026-06-22)_
- `4960f1ba5` fix(web2) SSE: vá 18 finding audit cross-instance (double-deliver, reconnect, pool churn, keepalive, log noise, shutdown) _(2026-06-22)_
- `0898d3a28` fix(web2) SSE: BOOT*ID luôn random suffix (slice RENDER_INSTANCE_ID có thể trùng service-id giữa instance → fan-out vỡ) *(2026-06-22)\_
- `c196d5cdf` feat(web2) SSE: crossStats (published/received/deliveredFromPeers) trong /sse/stats — verify vòng LISTEN/NOTIFY sống _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-005451-7cac4da` cho Claude walk chain theo CLAUDE.md protocol.
