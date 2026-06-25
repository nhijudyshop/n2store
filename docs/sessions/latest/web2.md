# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-173630-9d637c7`
**Session file**: [`./20260625-173630-9d637c7.md`](../20260625-173630-9d637c7.md)
**Commit**: `9d637c7` — docs(dev-log): so-order browser-test — fix SSE realtime + địa danh derive (verified)
**Last updated**: 2026-06-25 17:36:30 +07
**Summary**: browser-test so-order: fix SSE web2/products hiện SP mới (no F5) + region derive prefix mã (12/12 verified)

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-app.js`

## Last 5 commits touching `web2/`

- `ac6f6ce5d` fix(web2/products): SSE realtime hiện SP mới từ so-order (không cần F5) + region-derive prefix mã _(2026-06-25)_
- `5d6d71300` feat(web2/live-control,live-tv): ĐỊA DANH riêng + TV NCC/Bán/Cọc/Còn _(2026-06-25)_
- `c643b507f` feat(web2/ai-hub): "AI viết mô tả" ở Ghép đồ & HTML Studio xuất tiếng ANH _(2026-06-25)_
- `234147eb6` fix(web2/ai-hub): nâng maxTokens cho "AI viết mô tả" — hết bị cắt giữa câu _(2026-06-25)_
- `7a694d23a` fix(web2/ai-hub): chat fallback non-stream khi stream lỗi + xoay key org-restricted; nút "✨ AI viết mô tả" cho Ghép đồ & HTML Studio _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-173630-9d637c7` cho Claude walk chain theo CLAUDE.md protocol.
