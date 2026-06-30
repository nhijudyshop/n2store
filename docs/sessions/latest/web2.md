# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-145032-7d5d7b2`
**Session file**: [`./20260630-145032-7d5d7b2.md`](../20260630-145032-7d5d7b2.md)
**Commit**: `7d5d7b2` — feat(so-order): surface 'chờ hàng cần đặt' (giỏ nháp > tồn) → nút Cần đặt + thêm vào đơn [#2 follow-up]
**Last updated**: 2026-06-30 14:50:32 +07
**Summary**: feat(so-order): surface 'chờ hàng cần đặt' (giỏ nháp > tồn) → nút Cần đặt + thêm vào đơn [#2...

## Files changed in this commit (`web2/`)

- `web2/shared/web2-products-api.js`

## Last 5 commits touching `web2/`

- `7d5d7b24e` feat(so-order): surface 'chờ hàng cần đặt' (giỏ nháp > tồn) → nút Cần đặt + thêm vào đơn [#2 follow-up] _(2026-06-30)_
- `b8f267330` feat(live-control): bỏ NCC gõ tay → 'Chờ hàng' = GIỎ−TỒN (tự suy, board TỒN·GIỎ·MỚI·CHỜ; bỏ selector cho-vượt) [#2] _(2026-06-30)_
- `3436cef44` feat(live-control): gỡ tạo chiến dịch → chỉ tạo/gán ở live-chat (1 nguồn) [#1 bước 1] _(2026-06-30)_
- `79ba6e550` feat(products): bỏ tạo SP trực tiếp ở Kho → Sổ Order là nguồn duy nhất (SP luôn có địa danh) [P4] _(2026-06-30)_
- `1b2205386` feat(shared): Web2ProductStatus 1 nguồn trạng thái SP + badge 'chờ hàng' live-chat (P2); migrate web2/products khỏi fork _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-145032-7d5d7b2` cho Claude walk chain theo CLAUDE.md protocol.
