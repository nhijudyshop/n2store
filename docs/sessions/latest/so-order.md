# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-120429-8c5c8e3`
**Session file**: [`./20260627-120429-8c5c8e3.md`](../20260627-120429-8c5c8e3.md)
**Commit**: `8c5c8e3` — auto: session update
**Last updated**: 2026-06-27 12:04:29 +07
**Summary**: auto: session update

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `6ceb6f4aa` feat(web2): trang chỉ-admin ẩn khỏi menu nhân viên + chặn URL trực tiếp _(2026-06-27)_
- `52f5e4b5a` fix(web2 flow): nhận hàng đúng NCC (#1/#8) + hủy PBH restock per-code (#9) + audit doc _(2026-06-26)_
- `556aa7965` refactor(web2-variant-picker): genName dùng toLocaleUpperCase('vi-VN') (defensive) _(2026-06-26)_
- `bb894ec87` feat(so-order): tự tạo TÊN SP từ biến thể đã chọn (sửa được) _(2026-06-26)_
- `246e72c6d` feat(so-order): Phase 3b — modal Tạo/Sửa đơn dùng Web2VariantPicker _(2026-06-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-120429-8c5c8e3` cho Claude walk chain theo CLAUDE.md protocol.
