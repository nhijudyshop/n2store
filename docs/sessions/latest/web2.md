# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-163230-662ee11`
**Session file**: [`./20260630-163230-662ee11.md`](../20260630-163230-662ee11.md)
**Commit**: `662ee11` — refactor(web2-products): computeProductStatus 1 nguồn + fix confirm-partial HET_HANG; cross-link công thức chờ hàng (audit #2,#3)
**Last updated**: 2026-06-30 16:32:30 +07
**Summary**: refactor(web2-products): computeProductStatus 1 nguồn + fix confirm-partial HET_HANG; cross-link công thức chờ...

## Files changed in this commit (`web2/`)

- `web2/order-tags/index.html`
- `web2/shared/web2-live-tv-display.js`
- `web2/shared/web2-order-tag-detail.js`

## Last 5 commits touching `web2/`

- `662ee1163` refactor(web2-products): computeProductStatus 1 nguồn + fix confirm-partial HET*HANG; cross-link công thức chờ hàng (audit #2,#3) *(2026-06-30)\_
- `a45bb6d50` refactor(order-tags): gộp tag 'Âm mã' → 'Chờ hàng' (over-sell = chờ hàng = cần đặt NCC, 1 khái niệm) _(2026-06-30)_
- `5081f02ae` refactor(shared): gỡ compat ncc/vuot khỏi khConModel/cardState (không consumer nào đọc) [sau #2] _(2026-06-30)_
- `7d5d7b24e` feat(so-order): surface 'chờ hàng cần đặt' (giỏ nháp > tồn) → nút Cần đặt + thêm vào đơn [#2 follow-up] _(2026-06-30)_
- `b8f267330` feat(live-control): bỏ NCC gõ tay → 'Chờ hàng' = GIỎ−TỒN (tự suy, board TỒN·GIỎ·MỚI·CHỜ; bỏ selector cho-vượt) [#2] _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-163230-662ee11` cho Claude walk chain theo CLAUDE.md protocol.
