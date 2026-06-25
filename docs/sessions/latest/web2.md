# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-160203-e552a34`
**Session file**: [`./20260625-160203-e552a34.md`](../20260625-160203-e552a34.md)
**Commit**: `e552a34` — auto: session update
**Last updated**: 2026-06-25 16:02:03 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/shared/web2-content-maker.js`
- `web2/shared/web2-tryon.js`

## Last 5 commits touching `web2/`

- `e552a3428` auto: session update _(2026-06-25)_
- `28cf5a5f2` fix(web2): quét 107 file — 18 nhãn native-cart sót → Giỏ hàng (audit vòng 4) _(2026-06-25)_
- `176072707` fix(web2/order-tags): reframe 'đơn hàng' → Đơn Web/Giỏ hàng theo predicate (audit vòng 3) _(2026-06-25)_
- `2f762a5ce` fix(web2): order-tags + shared — bản ghi chưa PBH = 'Giỏ hàng' (audit vòng 2) _(2026-06-25)_
- `b5407f840` feat(web2/ai-assistant): cascade model mạnh→yếu xoay mọi key free + thêm model mạnh _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-160203-e552a34` cho Claude walk chain theo CLAUDE.md protocol.
