# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-164406-6aed6fc`
**Session file**: [`./20260621-164406-6aed6fc.md`](../20260621-164406-6aed6fc.md)
**Commit**: `6aed6fc` — auto: session update
**Last updated**: 2026-06-21 16:44:06 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/video-maker/index.html`
- `web2/video-maker/js/video-maker.js`
- `web2/video-maker/js/video-tts.js`

## Last 5 commits touching `web2/`

- `6aed6fc0b` auto: session update _(2026-06-21)_
- `3906f4cf5` auto: session update _(2026-06-21)_
- `e7a767d77` feat(web2): TAG đơn hàng auto theo trigger + chặn PBH khi có SP chờ hàng _(2026-06-21)_
- `b9f567be7` fix(web2) audit-d: 9 money-path bugs (over-refund regression, PBH oversell/drift, wallet double-credit, sepay race) _(2026-06-21)_
- `2d86f265c` fix(web2) audit-r9: 16 bug (worker SSRF/log-leak, ZNS idempotency, SSE-notify, idempotency) _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-164406-6aed6fc` cho Claude walk chain theo CLAUDE.md protocol.
