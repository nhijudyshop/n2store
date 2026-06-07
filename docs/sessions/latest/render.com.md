# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-171305-cba3731`
**Session file**: [`./20260607-171305-cba3731.md`](../20260607-171305-cba3731.md)
**Commit**: `cba3731` — feat(web2): warehouse POST /batch-by-fbid — enricher đọc web2_customers theo fb_id hàng loạt
**Last updated**: 2026-06-07 17:13:05 +07
**Summary**: feat(web2): warehouse POST /batch-by-fbid — enricher đọc web2_customers theo fb_id hàng loạt

## Files changed in this commit (`render.com/`)

- `render.com/routes/v2/web2-customers.js`
- `render.com/routes/web2-fb-live.js`
- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `cba3731ab` feat(web2): warehouse POST /batch-by-fbid — enricher đọc web2*customers theo fb_id hàng loạt *(2026-06-07)\_
- `433131997` feat(web2): Phase C-backend — web2-fb-live.js (FB Live thay TPOS, additive) _(2026-06-07)_
- `190b7fa91` feat(web2): Phase 1 — gộp kho KH thành 1 warehouse web2*customers (bỏ TPOS) + CRUD route + SSE + dọn dead migrate *(2026-06-07)\_
- `30b61846c` auto: session update _(2026-06-07)_
- `fbb5117e7` auto: session update _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-171305-cba3731` cho Claude walk chain theo CLAUDE.md protocol.
