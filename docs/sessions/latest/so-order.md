# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-231413-6f8a3e6`
**Session file**: [`./20260622-231413-6f8a3e6.md`](../20260622-231413-6f8a3e6.md)
**Commit**: `6f8a3e6` — fix(web2-video-maker): hiện giọng đã thêm từ kho ngay lần đầu + dedup giọng trùng
**Last updated**: 2026-06-22 23:14:13 +07
**Summary**: video-maker: fix giọng kho không hiện lần đầu (init ordering) + dedup giọng trùng

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `6f8a3e67b` fix(web2-video-maker): hiện giọng đã thêm từ kho ngay lần đầu + dedup giọng trùng _(2026-06-22)_
- `1cc23853f` feat(web2-audit-log): per-record history (openRecord modal) + reference native-orders/so-order _(2026-06-22)_
- `3a28de7ac` change(so-order): bỏ nút Quét mã (camera barcode) trong modal — chỉ còn Thêm sản phẩm _(2026-06-22)_
- `8de301814` change(so-order): random fill gắn lại ảnh ngẫu nhiên (Lorem Picsum no-key) + SVG data-URI fallback; bỏ nút Đọc nhãn (OCR) _(2026-06-22)_
- `33f0490c6` auto: session update _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-231413-6f8a3e6` cho Claude walk chain theo CLAUDE.md protocol.
