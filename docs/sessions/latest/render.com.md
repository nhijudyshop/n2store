# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-183953-0e530bd`
**Session file**: [`./20260607-183953-0e530bd.md`](../20260607-183953-0e530bd.md)
**Commit**: `0e530bd` — feat(web2): cắt TPOS — picker FB Graph (flag) + live-campaign CRUD→web2_live_campaigns
**Last updated**: 2026-06-07 18:39:53 +07
**Summary**: feat(web2): cắt TPOS — picker FB Graph (flag) + live-campaign CRUD→web2_live_campaigns

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-live-campaigns.js`
- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `0e530bd04` feat(web2): cắt TPOS — picker FB Graph (flag) + live-campaign CRUD→web2*live_campaigns *(2026-06-07)\_
- `88c9a2660` feat(tpos-pancake): rewire cột comment live TPOS→FB Graph (flag-gated, fallback-safe) _(2026-06-07)_
- `cba3731ab` feat(web2): warehouse POST /batch-by-fbid — enricher đọc web2*customers theo fb_id hàng loạt *(2026-06-07)\_
- `433131997` feat(web2): Phase C-backend — web2-fb-live.js (FB Live thay TPOS, additive) _(2026-06-07)_
- `190b7fa91` feat(web2): Phase 1 — gộp kho KH thành 1 warehouse web2*customers (bỏ TPOS) + CRUD route + SSE + dọn dead migrate *(2026-06-07)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-183953-0e530bd` cho Claude walk chain theo CLAUDE.md protocol.
