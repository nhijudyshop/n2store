# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-200410-3a28de7`
**Session file**: [`./20260622-200410-3a28de7.md`](../20260622-200410-3a28de7.md)
**Commit**: `3a28de7` — change(so-order): bỏ nút Quét mã (camera barcode) trong modal — chỉ còn Thêm sản phẩm
**Last updated**: 2026-06-22 20:04:10 +07
**Summary**: change(so-order): bỏ nút Quét mã (camera barcode) trong modal — chỉ còn Thêm sản phẩm

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-modal-core.js`

## Last 5 commits touching `so-order/`

- `3a28de7ac` change(so-order): bỏ nút Quét mã (camera barcode) trong modal — chỉ còn Thêm sản phẩm _(2026-06-22)_
- `8de301814` change(so-order): random fill gắn lại ảnh ngẫu nhiên (Lorem Picsum no-key) + SVG data-URI fallback; bỏ nút Đọc nhãn (OCR) _(2026-06-22)_
- `33f0490c6` auto: session update _(2026-06-22)_
- `a9b4a5b13` fix(native-orders) tag-add jank: in-place .col-tag update + smooth pop-in for new pills only (compositor-only, no avatar reload, no re-pop) _(2026-06-22)_
- `7d629864b` change(so-order): random fill tạo data test KHÔNG kèm hình _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-200410-3a28de7` cho Claude walk chain theo CLAUDE.md protocol.
