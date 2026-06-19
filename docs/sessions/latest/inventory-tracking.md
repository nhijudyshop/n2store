# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-121936-ed7cdd7`
**Session file**: [`./20260619-121936-ed7cdd7.md`](../20260619-121936-ed7cdd7.md)
**Commit**: `ed7cdd7` — feat(web2/photo-editor): trang Chỉnh sửa ảnh + module dùng chung Web2ImageEditor (Filerobot, on-device)
**Last updated**: 2026-06-19 12:19:36 +07
**Summary**: feat(web2/photo-editor): trang Chỉnh sửa ảnh + module dùng chung Web2ImageEditor (Filerobot, on-device)

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/css/modal-convert-po.css`
- `inventory-tracking/index.html`
- `inventory-tracking/js/modal-convert-po.js`

## Last 5 commits touching `inventory-tracking/`

- `4199e3b5f` feat(inventory-tracking): nút "Cập nhật từ TPOS" per-row trong modal Tạo đơn đặt hàng _(2026-06-19)_
- `b2a7acbf2` feat(inventory-tracking): nút "Cập nhật TPOS" full sync trong modal Tạo đơn đặt hàng _(2026-06-19)_
- `85771c3f7` fix(auth): SwitchCompany theo công ty đang chọn — NJD Live = Company 1 (kho live) _(2026-06-16)_
- `fa7fffe37` style(inventory-tracking): bo gach cheo + hien ro hon cho NCC an khi reveal _(2026-06-08)_
- `7e9fed66d` fix(inventory-tracking): NCC ẩn không thực sự ẩn hàng SP — apply hidden state sau render + khi expand _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-121936-ed7cdd7` cho Claude walk chain theo CLAUDE.md protocol.
