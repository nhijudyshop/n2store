# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-173630-9d637c7`
**Session file**: [`./20260625-173630-9d637c7.md`](../20260625-173630-9d637c7.md)
**Commit**: `9d637c7` — docs(dev-log): so-order browser-test — fix SSE realtime + địa danh derive (verified)
**Last updated**: 2026-06-25 17:36:30 +07
**Summary**: browser-test so-order: fix SSE web2/products hiện SP mới (no F5) + region derive prefix mã (12/12 verified)

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-campaign-products.js`
- `render.com/routes/web2-products.js`

## Last 5 commits touching `render.com/`

- `ac6f6ce5d` fix(web2/products): SSE realtime hiện SP mới từ so-order (không cần F5) + region-derive prefix mã _(2026-06-25)_
- `a90cf119b` fix(web2): backfill region từ PREFIX MÃ (HN/HC) — note ILIKE chữ Việt không khớp Unicode _(2026-06-25)_
- `6ddc1a83a` fix(web2): auto-heal region từ note (un-gate migration 080) + random NCC bỏ địa danh _(2026-06-25)_
- `dfde62633` auto: session update _(2026-06-25)_
- `c643b507f` feat(web2/ai-hub): "AI viết mô tả" ở Ghép đồ & HTML Studio xuất tiếng ANH _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-173630-9d637c7` cho Claude walk chain theo CLAUDE.md protocol.
