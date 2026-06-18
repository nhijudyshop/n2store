# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-210709-36445c0`
**Session file**: [`./20260618-210709-36445c0.md`](../20260618-210709-36445c0.md)
**Commit**: `36445c0` — feat(so-order): Quét mã (camera) + Đọc nhãn (OCR) trong modal Thêm SP — nhập kho từ pack (a/b/c xong)
**Last updated**: 2026-06-18 21:07:09 +07
**Summary**: feat(so-order): Quét mã (camera) + Đọc nhãn (OCR) trong modal Thêm SP — nhập kho từ pack (a/b/c xong)

## Files changed in this commit (`web2/`)

- `web2/product-counter/index.html`
- `web2/shared/web2-customer-chat.js`
- `web2/shared/web2-label-ocr.js`
- `web2/shared/web2-pack-counter.js`

## Last 5 commits touching `web2/`

- `f8bc38181` feat(web2): đếm bó/pack bằng camera opencv.js + chạm sửa tay (Web2PackCounter, Đợt 4) _(2026-06-18)_
- `50c174fe5` feat(web2/label-ocr): thêm chế độ đọc chữ TAY (TrOCR/transformers.js) — toggle Chữ in _(Chữ tay (Đợt 3)|2026-06-18)_
- `9544088f8` feat(web2): đọc nhãn bằng camera OCR on-device (Web2LabelOcr, Đợt 2) + cắm reconcile _(2026-06-18)_
- `d93620b27` feat(web2): quét barcode/QR bằng camera on-device (Web2BarcodeScanner) + cắm vào reconcile _(2026-06-18)_
- `f19fcbd0c` auto: session update _(2026-06-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-210709-36445c0` cho Claude walk chain theo CLAUDE.md protocol.
