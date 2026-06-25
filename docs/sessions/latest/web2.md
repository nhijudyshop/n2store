# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-181147-9591e8c`
**Session file**: [`./20260625-181147-9591e8c.md`](../20260625-181147-9591e8c.md)
**Commit**: `9591e8c` — feat(web2/ai-hub): Ghép đồ — dán ảnh (Ctrl+V) + kéo-thả cho ô Ảnh người & Ảnh quần áo
**Last updated**: 2026-06-25 18:11:47 +07
**Summary**: ai-hub Ghép đồ: dán ảnh Ctrl+V + kéo-thả (Web2ImagePaste.enhance)

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/shared/web2-tryon.js`

## Last 5 commits touching `web2/`

- `9591e8c00` feat(web2/ai-hub): Ghép đồ — dán ảnh (Ctrl+V) + kéo-thả cho ô Ảnh người & Ảnh quần áo _(2026-06-25)_
- `ac6f6ce5d` fix(web2/products): SSE realtime hiện SP mới từ so-order (không cần F5) + region-derive prefix mã _(2026-06-25)_
- `5d6d71300` feat(web2/live-control,live-tv): ĐỊA DANH riêng + TV NCC/Bán/Cọc/Còn _(2026-06-25)_
- `c643b507f` feat(web2/ai-hub): "AI viết mô tả" ở Ghép đồ & HTML Studio xuất tiếng ANH _(2026-06-25)_
- `234147eb6` fix(web2/ai-hub): nâng maxTokens cho "AI viết mô tả" — hết bị cắt giữa câu _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-181147-9591e8c` cho Claude walk chain theo CLAUDE.md protocol.
