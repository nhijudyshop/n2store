# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-153042-1760727`
**Session file**: [`./20260625-153042-1760727.md`](../20260625-153042-1760727.md)
**Commit**: `1760727` — fix(web2/order-tags): reframe 'đơn hàng' → Đơn Web/Giỏ hàng theo predicate (audit vòng 3)
**Last updated**: 2026-06-25 15:30:42 +07
**Summary**: audit vòng 3: reframe order-tags 'đơn hàng'→Đơn Web/Giỏ hàng (workflow predicate-verify)

## Files changed in this commit (`web2/`)

- `web2/order-tags/index.html`
- `web2/order-tags/js/order-tags-app.js`

## Last 5 commits touching `web2/`

- `176072707` fix(web2/order-tags): reframe 'đơn hàng' → Đơn Web/Giỏ hàng theo predicate (audit vòng 3) _(2026-06-25)_
- `2f762a5ce` fix(web2): order-tags + shared — bản ghi chưa PBH = 'Giỏ hàng' (audit vòng 2) _(2026-06-25)_
- `b5407f840` feat(web2/ai-assistant): cascade model mạnh→yếu xoay mọi key free + thêm model mạnh _(2026-06-25)_
- `cefbfefbd` fix(web2/ai-assistant): hết đứt câu trả lời (stream Gemini từng chữ) + nút xóa chat _(2026-06-25)_
- `7f8dd21b8` auto: session update _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-153042-1760727` cho Claude walk chain theo CLAUDE.md protocol.
