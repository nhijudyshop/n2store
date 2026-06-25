# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-163554-dfde626`
**Session file**: [`./20260625-163554-dfde626.md`](../20260625-163554-dfde626.md)
**Commit**: `dfde626` — auto: session update
**Last updated**: 2026-06-25 16:35:54 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/shared/web2-content-maker.js`
- `web2/shared/web2-tryon.js`

## Last 5 commits touching `web2/`

- `c643b507f` feat(web2/ai-hub): "AI viết mô tả" ở Ghép đồ & HTML Studio xuất tiếng ANH _(2026-06-25)_
- `234147eb6` fix(web2/ai-hub): nâng maxTokens cho "AI viết mô tả" — hết bị cắt giữa câu _(2026-06-25)_
- `7a694d23a` fix(web2/ai-hub): chat fallback non-stream khi stream lỗi + xoay key org-restricted; nút "✨ AI viết mô tả" cho Ghép đồ & HTML Studio _(2026-06-25)_
- `e552a3428` auto: session update _(2026-06-25)_
- `28cf5a5f2` fix(web2): quét 107 file — 18 nhãn native-cart sót → Giỏ hàng (audit vòng 4) _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-163554-dfde626` cho Claude walk chain theo CLAUDE.md protocol.
