# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-203540-d93620b`
**Session file**: [`./20260618-203540-d93620b.md`](../20260618-203540-d93620b.md)
**Commit**: `d93620b` — feat(web2): quét barcode/QR bằng camera on-device (Web2BarcodeScanner) + cắm vào reconcile
**Last updated**: 2026-06-18 20:35:40 +07
**Summary**: feat(web2): quét barcode/QR bằng camera on-device (Web2BarcodeScanner) + cắm vào reconcile

## Files changed in this commit (`web2/`)

- `web2/shared/web2-barcode-scanner.js`

## Last 5 commits touching `web2/`

- `d93620b27` feat(web2): quét barcode/QR bằng camera on-device (Web2BarcodeScanner) + cắm vào reconcile _(2026-06-18)_
- `f19fcbd0c` auto: session update _(2026-06-18)_
- `5f656a890` feat(web2/product-counter): phone-only app-like UI (full-screen, safe-area, bottom-bar thumb-zone) _(2026-06-18)_
- `a122c7d49` auto: session update _(2026-06-18)_
- `6d1fc53f2` fix(web2): audit toàn bộ Web 2.0 — 16 bug (IME, race, null-deref, leak, double-submit, money display) _(2026-06-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-203540-d93620b` cho Claude walk chain theo CLAUDE.md protocol.
