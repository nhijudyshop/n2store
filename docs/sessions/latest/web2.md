# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-161605-234147e`
**Session file**: [`./20260625-161605-234147e.md`](../20260625-161605-234147e.md)
**Commit**: `234147e` — fix(web2/ai-hub): nâng maxTokens cho "AI viết mô tả" — hết bị cắt giữa câu
**Last updated**: 2026-06-25 16:16:05 +07
**Summary**: ai-hub: nâng maxTokens AI viết mô tả (hết cắt giữa câu)

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/shared/web2-ai-describe.js`
- `web2/shared/web2-content-maker.js`

## Last 5 commits touching `web2/`

- `234147eb6` fix(web2/ai-hub): nâng maxTokens cho "AI viết mô tả" — hết bị cắt giữa câu _(2026-06-25)_
- `7a694d23a` fix(web2/ai-hub): chat fallback non-stream khi stream lỗi + xoay key org-restricted; nút "✨ AI viết mô tả" cho Ghép đồ & HTML Studio _(2026-06-25)_
- `e552a3428` auto: session update _(2026-06-25)_
- `28cf5a5f2` fix(web2): quét 107 file — 18 nhãn native-cart sót → Giỏ hàng (audit vòng 4) _(2026-06-25)_
- `176072707` fix(web2/order-tags): reframe 'đơn hàng' → Đơn Web/Giỏ hàng theo predicate (audit vòng 3) _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-161605-234147e` cho Claude walk chain theo CLAUDE.md protocol.
