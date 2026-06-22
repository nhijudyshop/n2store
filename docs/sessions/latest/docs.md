# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-200410-3a28de7`
**Session file**: [`./20260622-200410-3a28de7.md`](../20260622-200410-3a28de7.md)
**Commit**: `3a28de7` — change(so-order): bỏ nút Quét mã (camera barcode) trong modal — chỉ còn Thêm sản phẩm
**Last updated**: 2026-06-22 20:04:10 +07
**Summary**: change(so-order): bỏ nút Quét mã (camera barcode) trong modal — chỉ còn Thêm sản phẩm

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `3a28de7ac` change(so-order): bỏ nút Quét mã (camera barcode) trong modal — chỉ còn Thêm sản phẩm _(2026-06-22)_
- `d2cfa0d12` chore(session): RESUME:20260622-193456-8de3018 _(2026-06-22)_
- `8de301814` change(so-order): random fill gắn lại ảnh ngẫu nhiên (Lorem Picsum no-key) + SVG data-URI fallback; bỏ nút Đọc nhãn (OCR) _(2026-06-22)_
- `9f135bce3` chore(session): RESUME:20260622-191944-33f0490 _(2026-06-22)_
- `505e62976` feat(inventory-tracking): nút "Lưu nháp" cho modal Tạo đơn đặt hàng (Convert PO) _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-200410-3a28de7` cho Claude walk chain theo CLAUDE.md protocol.
