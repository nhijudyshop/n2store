# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-170704-a90cf11`
**Session file**: [`./20260625-170704-a90cf11.md`](../20260625-170704-a90cf11.md)
**Commit**: `a90cf11` — fix(web2): backfill region từ PREFIX MÃ (HN/HC) — note ILIKE chữ Việt không khớp Unicode
**Last updated**: 2026-06-25 17:07:04 +07
**Summary**: live-control TV NCC/Bán/Cọc/Còn + địa danh riêng (region) — fix backfill code-prefix, verify heal 5/5

## Files changed in this commit (`web2/`)

- `web2/live-control/css/live-control.css`
- `web2/live-control/index.html`
- `web2/live-control/js/live-control.js`
- `web2/live-tv/css/live-tv.css`
- `web2/live-tv/index.html`
- `web2/live-tv/js/live-tv.js`
- `web2/products/css/web2-products.css`
- `web2/products/index.html`
- `web2/products/js/web2-products-render.js`
- `web2/shared/web2-variant-group.js`

## Last 5 commits touching `web2/`

- `5d6d71300` feat(web2/live-control,live-tv): ĐỊA DANH riêng + TV NCC/Bán/Cọc/Còn _(2026-06-25)_
- `c643b507f` feat(web2/ai-hub): "AI viết mô tả" ở Ghép đồ & HTML Studio xuất tiếng ANH _(2026-06-25)_
- `234147eb6` fix(web2/ai-hub): nâng maxTokens cho "AI viết mô tả" — hết bị cắt giữa câu _(2026-06-25)_
- `7a694d23a` fix(web2/ai-hub): chat fallback non-stream khi stream lỗi + xoay key org-restricted; nút "✨ AI viết mô tả" cho Ghép đồ & HTML Studio _(2026-06-25)_
- `e552a3428` auto: session update _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-170704-a90cf11` cho Claude walk chain theo CLAUDE.md protocol.
