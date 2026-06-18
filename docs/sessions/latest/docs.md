# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-204429-9544088`
**Session file**: [`./20260618-204429-9544088.md`](../20260618-204429-9544088.md)
**Commit**: `9544088` — feat(web2): đọc nhãn bằng camera OCR on-device (Web2LabelOcr, Đợt 2) + cắm reconcile
**Last updated**: 2026-06-18 20:44:29 +07
**Summary**: feat(web2): đọc nhãn bằng camera OCR on-device (Web2LabelOcr, Đợt 2) + cắm reconcile

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `9544088f8` feat(web2): đọc nhãn bằng camera OCR on-device (Web2LabelOcr, Đợt 2) + cắm reconcile _(2026-06-18)_
- `c1209e5b2` chore(session): RESUME:20260618-203540-d93620b _(2026-06-18)_
- `d93620b27` feat(web2): quét barcode/QR bằng camera on-device (Web2BarcodeScanner) + cắm vào reconcile _(2026-06-18)_
- `6d9e75a2b` chore(session): RESUME:20260618-203311-f19fcbd _(2026-06-18)_
- `26a18e91c` fix(native-orders): giữ modal 3-cột Pancake (có tìm kiếm) + fallback resolve hội thoại theo SĐT khi fbid lệch PSID _(2026-06-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-204429-9544088` cho Claude walk chain theo CLAUDE.md protocol.
