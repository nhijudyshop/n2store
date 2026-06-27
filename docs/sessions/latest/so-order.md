# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-193240-1b66b72`
**Session file**: [`./20260627-193240-1b66b72.md`](../20260627-193240-1b66b72.md)
**Commit**: `1b66b72` — auto: session update
**Last updated**: 2026-06-27 19:32:40 +07
**Summary**: auto: session update

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-modal-core.js`
- `so-order/js/so-order-render.js`
- `so-order/js/so-order-storage.js`

## Last 5 commits touching `so-order/`

- `1b66b72ea` auto: session update _(2026-06-27)_
- `6ceb6f4aa` feat(web2): trang chỉ-admin ẩn khỏi menu nhân viên + chặn URL trực tiếp _(2026-06-27)_
- `52f5e4b5a` fix(web2 flow): nhận hàng đúng NCC (#1/#8) + hủy PBH restock per-code (#9) + audit doc _(2026-06-26)_
- `556aa7965` refactor(web2-variant-picker): genName dùng toLocaleUpperCase('vi-VN') (defensive) _(2026-06-26)_
- `bb894ec87` feat(so-order): tự tạo TÊN SP từ biến thể đã chọn (sửa được) _(2026-06-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-193240-1b66b72` cho Claude walk chain theo CLAUDE.md protocol.
