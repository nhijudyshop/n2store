# Latest Snapshot — `cloudflare-worker/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-180731-19664fd`
**Session file**: [`./20260607-180731-19664fd.md`](../20260607-180731-19664fd.md)
**Commit**: `19664fd` — fix(worker): route /api/web2-fb-live/_ → Render (không rơi vào TPOS catch-all)
**Last updated**: 2026-06-07 18:07:31 +07
**Summary**: fix(worker): route /api/web2-fb-live/_ → Render (không rơi vào TPOS catch-all)

## Files changed in this commit (`cloudflare-worker/`)

- `cloudflare-worker/modules/config/routes.js`
- `cloudflare-worker/worker.js`

## Last 5 commits touching `cloudflare-worker/`

- `19664fdc4` fix(worker): route /api/web2-fb-live/\* → Render (không rơi vào TPOS catch-all) _(2026-06-07)_
- `baf38853a` feat(worker): route /api/web2-returns/\* → Render (proxy cho trang Thu về) _(2026-06-06)_
- `0b7da17c0` feat(cf-worker): route /api/services-overview to Render _(2026-05-30)_
- `411482c33` feat(domain): rewire codebase sang custom domain nhijudy.store _(2026-05-21)_
- `79e8f9a7a` feat(web2/purchase-refund): state machine + stock side-effects backend _(2026-05-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-180731-19664fd` cho Claude walk chain theo CLAUDE.md protocol.
